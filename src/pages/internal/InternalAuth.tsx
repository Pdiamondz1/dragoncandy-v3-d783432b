import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Founders-only login for the internal host (internal.dragoncandy.io).
 * Login only — AIOS access is provisioned via user_roles, never self-served,
 * so there is deliberately no signup path here. Mirrors AuthForm's login
 * mechanics exactly (signInWithPassword + email_verified check).
 */
const InternalAuth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email_verified')
          .eq('id', data.user.id)
          .single();
        if (profile && !profile.email_verified) {
          await supabase.auth.signOut();
          setError('Please verify your email before logging in.');
          setLoading(false);
          return;
        }
      }
      navigate('/internal', { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-dc-dark">
      <style>{`
        @keyframes aios-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aios-grid-pan {
          from { background-position: 0 0; }
          to { background-position: 56px 56px; }
        }
        @keyframes aios-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(77, 217, 192, 0.6); }
          50% { opacity: 0.6; box-shadow: 0 0 0 6px rgba(77, 217, 192, 0); }
        }
        .aios-rise { opacity: 0; animation: aios-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .aios-grid { animation: aios-grid-pan 24s linear infinite; }
        .aios-dot { animation: aios-pulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .aios-rise { animation: none; opacity: 1; }
          .aios-grid, .aios-dot { animation: none; }
        }
      `}</style>

      {/* Atmosphere: teal dawn top-left, pink ember bottom-right, blueprint grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-dc-teal/15 blur-[120px]" />
        <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-dc-pink-accent/15 blur-[120px]" />
        <div
          className="aios-grid absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(77,217,192,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(77,217,192,0.5) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        {/* Ghost wordmark */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[26vw] font-extrabold leading-none tracking-tighter text-white/[0.025] lg:-bottom-24 lg:text-[18vw]">
          AIOS
        </div>
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-6 py-12 lg:flex-row lg:gap-24">
        {/* Identity panel */}
        <section className="max-w-md text-center lg:text-left">
          <div className="aios-rise flex items-center justify-center gap-3 lg:justify-start" style={{ animationDelay: '0ms' }}>
            <img src="/logo.webp" alt="DragonCandy" className="h-12 w-auto" />
            <div className="h-8 w-px bg-dc-teal/30" />
            <span className="font-mono text-xs uppercase tracking-[0.35em] text-dc-teal">
              Internal OS
            </span>
          </div>

          <h1
            className="aios-rise mt-6 text-6xl font-extrabold leading-none tracking-tight text-white lg:text-7xl"
            style={{ animationDelay: '90ms' }}
          >
            AIOS
          </h1>
          <p
            className="aios-rise mt-3 text-base font-light text-dc-pink lg:text-lg"
            style={{ animationDelay: '180ms' }}
          >
            The DragonCandy operating deck — live stats, weekly briefs, findings, and Donny with
            the founders' brain.
          </p>

          <div
            className="aios-rise mt-8 inline-flex items-center gap-2.5 rounded-full border border-dc-teal/25 bg-dc-teal/10 px-4 py-1.5"
            style={{ animationDelay: '270ms' }}
          >
            <span className="aios-dot h-2 w-2 rounded-full bg-dc-teal" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dc-teal">
              Reports run Mondays · 8:07 ET
            </span>
          </div>
        </section>

        {/* Login card */}
        <section
          className="aios-rise w-full max-w-sm"
          style={{ animationDelay: '360ms' }}
        >
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-dc-teal/20 bg-white/[0.04] p-7 shadow-[0_0_60px_rgba(77,217,192,0.08)] backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-dc-teal" />
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-white/70">
                Founder access
              </h2>
            </div>

            <label htmlFor="aios-email" className="mt-6 block text-xs font-semibold uppercase tracking-wider text-dc-teal">
              Email
            </label>
            <input
              id="aios-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@dragoncandy.io"
              className="mt-1.5 w-full rounded-full border border-white/10 bg-dc-dark/60 px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-shadow focus:border-dc-teal/60 focus:shadow-[0_0_0_3px_rgba(77,217,192,0.18)]"
            />

            <label htmlFor="aios-password" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-dc-teal">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="aios-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full rounded-full border border-white/10 bg-dc-dark/60 px-5 py-3 pr-12 text-sm text-white placeholder:text-white/30 outline-none transition-shadow focus:border-dc-teal/60 focus:shadow-[0_0_0_3px_rgba(77,217,192,0.18)]"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-dc-teal"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-2xl border border-dc-pink-accent/40 bg-dc-pink-accent/10 px-4 py-2.5 text-xs text-dc-pink">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="mt-6 w-full rounded-full bg-dc-teal px-5 py-3 text-sm font-bold text-dc-dark transition-all hover:bg-dc-teal-dark hover:shadow-[0_0_24px_rgba(77,217,192,0.35)] disabled:opacity-40 disabled:hover:shadow-none"
            >
              {loading ? 'Authenticating…' : 'Enter the deck'}
            </button>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-white/40">
              Access is provisioned by a founder — there is no signup.
              <br />
              Forgot your password?{' '}
              <a
                href="https://dragoncandy.io/auth"
                className="text-dc-pink underline-offset-2 hover:underline"
              >
                Reset it on dragoncandy.io
              </a>
            </p>
          </form>
        </section>
      </main>

      <footer className="relative z-10 pb-6 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
        DragonCandy · Hoboken NJ · internal use only
      </footer>
    </div>
  );
};

export default InternalAuth;
