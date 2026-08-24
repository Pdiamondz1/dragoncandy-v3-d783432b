import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import {
  SOCIAL_PROVIDERS,
  PROVIDER_LABELS,
  SOCIAL_LOGIN_FLAG,
  startSocialSignIn,
  type SocialProvider,
} from '@/lib/socialAuth';
import type { AccountRole } from '@/lib/accountReadiness/types';

interface Props {
  mode: 'login' | 'signup';
  /** The role chosen before the redirect. Null on login, where role already exists. */
  role: AccountRole | null;
  onError: (message: string | null) => void;
}

/**
 * Inline SVG marks rather than an icon font or remote images: this renders on a
 * signed-out page, and each provider's brand guidelines require its own mark.
 * `aria-hidden` throughout — the button's text is the accessible name.
 */
const MARKS: Record<SocialProvider, JSX.Element> = {
  google: (
    <svg viewBox="0 0 18 18" className="w-[18px] h-[18px]" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 18 18" className="w-[18px] h-[18px]" aria-hidden focusable="false">
      <path fill="currentColor" d="M12.63 9.6c-.02-1.87 1.53-2.77 1.6-2.82-.87-1.28-2.23-1.45-2.71-1.47-1.15-.12-2.25.68-2.84.68-.58 0-1.49-.66-2.45-.65-1.26.02-2.42.73-3.07 1.86-1.31 2.27-.33 5.63.94 7.47.62.9 1.36 1.91 2.33 1.87.94-.04 1.29-.6 2.42-.6s1.45.6 2.44.58c1.01-.02 1.65-.91 2.26-1.82.71-1.04 1-2.05 1.02-2.1-.02-.01-1.96-.75-1.98-2.98ZM10.8 3.9c.52-.63.87-1.5.77-2.37-.75.03-1.65.5-2.19 1.12-.48.56-.9 1.45-.79 2.3.84.07 1.69-.42 2.21-1.05Z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 18 18" className="w-[18px] h-[18px]" aria-hidden focusable="false">
      <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.4V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9Z" />
    </svg>
  ),
};

/**
 * Social sign-in, off unless `SOCIAL_LOGIN_ENABLED` says otherwise.
 *
 * The flag is not decoration. `useFeatureFlag` fails safe to OFF, including when
 * the row does not exist — so until the founder configures the provider consoles
 * in Supabase and flips it, these buttons do not render at all. Rendering them
 * against unconfigured providers would offer every visitor a button that answers
 * "Unsupported provider".
 *
 * Nothing here decides anything about the account. The role travels to
 * `claim_initial_role` and the verification decision belongs to
 * `handle_new_user`; this component only starts the redirect.
 */
export function SocialAuthButtons({ mode, role, onError }: Props) {
  const enabled = useFeatureFlag(SOCIAL_LOGIN_FLAG);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  if (!enabled) return null;

  const handle = async (provider: SocialProvider) => {
    onError(null);
    setPending(provider);
    const result = await startSocialSignIn(provider, role);
    if (!result.ok) {
      onError(result.message ?? 'That sign-in is not available right now.');
      setPending(null);
      return;
    }
    // On success the browser is navigating away; leaving `pending` set keeps the
    // spinner up for the rest of this page's life rather than flashing back to an
    // idle button the user could press again.
  };

  const verb = mode === 'signup' ? 'Sign up' : 'Log in';

  return (
    <div className="max-w-sm md:max-w-md mx-auto w-full mt-5">
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-landing-line" />
        <span className="text-xs text-landing-ink-soft">or</span>
        <span className="h-px flex-1 bg-landing-line" />
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {SOCIAL_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => handle(provider)}
            disabled={pending !== null}
            className="w-full h-12 rounded-full border-2 border-landing-line bg-white flex items-center justify-center gap-3 text-sm font-semibold text-landing-ink hover:bg-landing-lilac disabled:opacity-60 transition-colors"
          >
            {pending === provider ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              MARKS[provider]
            )}
            {verb} with {PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>
    </div>
  );
}
