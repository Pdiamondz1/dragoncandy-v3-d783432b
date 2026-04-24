import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.png';

const SITE_PASSWORD = 'dragoncandy2026';
export const SITE_GATE_KEY = 'dc_site_unlocked';

export const isSiteUnlocked = () => {
  try {
    return sessionStorage.getItem(SITE_GATE_KEY) === 'true';
  } catch {
    return false;
  }
};

export default function SiteGate() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.trim() === SITE_PASSWORD) {
      try {
        sessionStorage.setItem(SITE_GATE_KEY, 'true');
      } catch {
        /* ignore */
      }
      // Send to Index, which will route to dashboard if signed in or to /landing if not.
      navigate('/home', { replace: true });
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 bg-gradient-to-br from-[#F9C8E0] via-white to-[#4DD9C0]/40">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-teal-300 p-8 md:p-10">
        <div className="flex flex-col items-center text-center">
          <img
            src={dragonCandyLogo}
            alt="DragonCandy"
            className="h-16 md:h-20 mb-6"
          />
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-2">
            Private Preview
          </h1>
          <p className="text-sm text-[#555555] mb-6">
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
            className="w-full h-12 rounded-full border-2 border-teal-300 bg-white px-5 text-base text-[#111111] placeholder:text-gray-400 focus:outline-none focus:border-[#EC4899] focus:ring-2 focus:ring-[#EC4899]/30 transition"
            aria-label="Site access password"
          />

          {error && (
            <p className="text-sm text-[#EC4899] font-semibold text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-full bg-[#4DD9C0] hover:bg-[#3cc6ad] text-white font-bold text-base shadow-md transition-colors"
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
