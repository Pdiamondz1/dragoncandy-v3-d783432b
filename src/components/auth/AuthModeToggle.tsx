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
        className="text-dc-teal font-semibold hover:underline disabled:opacity-60"
        onClick={() => onModeChange("login")}
        disabled={loading}
      >
        Log in
      </button>
    </div>
  );
};
