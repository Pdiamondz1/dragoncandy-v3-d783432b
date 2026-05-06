import { useState, FormEvent } from 'react';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.webp';
import { SITE_GATE_KEY, ONE_HOUR_MS } from '@/lib/siteGate';

const SITE_PASSWORD = 'dragoncandy2026';

export default function SiteGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.trim() === SITE_PASSWORD) {
      try {
        localStorage.setItem(SITE_GATE_KEY, String(Date.now() + ONE_HOUR_MS));
      } catch {
        /* ignore */
      }
      // Reload at the originally requested path (preserved in sessionStorage by the gate guard),
      // falling back to root.
      let target = '/';
      try {
        const saved = sessionStorage.getItem('dc_gate_redirect');
        if (saved) {
          sessionStorage.removeItem('dc_gate_redirect');
          target = saved;
        }
      } catch {
        /* ignore */
      }
      window.location.replace(target);
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 bg-gradient-to-br from-dc-pink-bg via-white to-dc-teal/40">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-teal-300 p-8 md:p-10">
        <div className="flex flex-col items-center text-center">
          <img
            src={dragonCandyLogo}
            alt="DragonCandy"
            className="h-16 md:h-20 mb-6"
          />
          <h1 className="text-2xl md:text-3xl font-extrabold text-dc-text mb-2">
            Private Preview
          </h1>
          <p className="text-sm text-dc-text-muted mb-6">
            Enter the access password to continue to DragonCandy.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Password"
            className="w-full h-12 rounded-full border-2 border-teal-300 bg-white px-5 text-base text-dc-text placeholder:text-gray-400 focus:outline-none focus:border-dc-pink-accent focus:ring-2 focus:ring-dc-pink-accent/30 transition"
            aria-label="Site access password"
          />

          {error && (
            <p className="text-sm text-dc-pink-accent font-semibold text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-full bg-dc-teal hover:bg-dc-teal-hover text-white font-bold text-base shadow-md transition-colors"
          >
            Submit
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-gray-400">
          DragonCandy © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
