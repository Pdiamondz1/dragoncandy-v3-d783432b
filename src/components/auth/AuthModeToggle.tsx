
interface AuthModeToggleProps {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  loading: boolean;
}

export const AuthModeToggle = ({ mode, onModeChange, loading }: AuthModeToggleProps) => {
  if (mode === "login") {
    return (
      <div className="mt-6 text-center text-sm">
        <span className="text-landing-ink-soft">New here? </span>
        <button
          type="button"
          className="text-landing-pink font-semibold hover:underline disabled:opacity-60"
          onClick={() => onModeChange("signup")}
          disabled={loading}
        >
          Sign up
        </button>
        <span className="text-landing-ink-soft"> as a Business, Brand, or Creator</span>
      </div>
    );
  }

  return (
    <div className="mt-6 text-center text-sm">
      <span className="text-landing-ink-soft">Already have an account? </span>
      <button
        type="button"
        className="text-landing-pink font-semibold hover:underline disabled:opacity-60"
        onClick={() => onModeChange("login")}
        disabled={loading}
      >
        Log in
      </button>
    </div>
  );
};
