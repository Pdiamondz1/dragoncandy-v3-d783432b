
import React from 'react';

interface AuthModeToggleProps {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  loading: boolean;
}

export const AuthModeToggle = ({ mode, onModeChange, loading }: AuthModeToggleProps) => {
  return (
    <div className="mt-6 text-center text-sm text-white">
      {mode === "signup" ? (
        <>
          Already have an account?{" "}
          <button
            className="font-semibold underline underline-offset-2 text-dc-teal"
            type="button"
            onClick={() => onModeChange("login")}
            disabled={loading}
          >
            Log in
          </button>
        </>
      ) : (
        <>
          Don&apos;t have an account?{" "}
          <button
            className="font-semibold underline underline-offset-2 text-dc-teal"
            type="button"
            onClick={() => onModeChange("signup")}
            disabled={loading}
          >
            Sign up
          </button>
        </>
      )}
    </div>
  );
};
