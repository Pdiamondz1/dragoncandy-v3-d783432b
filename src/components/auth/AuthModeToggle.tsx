
import React from 'react';

interface AuthModeToggleProps {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  loading: boolean;
}

export const AuthModeToggle = ({ mode, onModeChange, loading }: AuthModeToggleProps) => {
  if (mode === "login") {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-xs text-white uppercase tracking-widest text-center font-medium">
          Don&apos;t have an account?
        </p>
        <button
          type="button"
          className="w-full rounded-full bg-dc-teal text-white font-bold text-base h-12 disabled:opacity-60 hover:bg-dc-teal-dark transition-colors"
          onClick={() => onModeChange("signup")}
          disabled={loading}
        >
          Sign Up
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 text-center text-sm text-white">
      Already have an account?{" "}
      <button
        className="font-semibold underline underline-offset-2 text-dc-teal"
        type="button"
        onClick={() => onModeChange("login")}
        disabled={loading}
      >
        Log in
      </button>
    </div>
  );
};
