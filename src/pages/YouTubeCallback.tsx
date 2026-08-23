import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { codeFromInvokeError } from '@/lib/invokeError';
import { YOUTUBE_RETURN_PATH_KEY } from '@/hooks/useYouTubeConnection';

/**
 * Where Google sends the browser after YouTube consent.
 *
 * This page exists for one reason: it is inside the app, so the user has a
 * session here. It hands the `code` to `youtube-oauth-callback` WITH that
 * session's JWT, which is what lets the backend prove the browser finishing
 * consent is the one that started it.
 *
 * Google cannot redirect straight to the edge function without losing that
 * proof — a top-level navigation from accounts.google.com carries no
 * Authorization header, and a signed state alone does not close the gap: an
 * attacker could start a flow and have a victim's tokens stored against the
 * attacker's account. The Workspace connect flow works the same way.
 *
 * Nothing renders for long. It exchanges, then replaces itself with wherever
 * the user was, carrying `?youtube=…` so the settings card can say what
 * happened — the card owns all the wording, this page only carries the code.
 */
export default function YouTubeCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Finishing your YouTube connection…');

  // React 18 StrictMode mounts effects twice in development, and an
  // authorization code is single-use — a second exchange fails and would
  // overwrite a genuine success with `exchange_failed`.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    /**
     * Where to land. The browser's own memory of where it was, stashed before
     * it left for Google — the server's signed copy only comes back on success,
     * and a failure needs somewhere to go too. Landing on `/` would drop the
     * user on the public landing page, which cannot show them what went wrong.
     */
    const stashed = sessionStorage.getItem(YOUTUBE_RETURN_PATH_KEY);
    sessionStorage.removeItem(YOUTUBE_RETURN_PATH_KEY);
    const fallbackPath = stashed && stashed.startsWith('/') ? stashed : '/';

    const goBack = (path: string, query: Record<string, string>) => {
      const search = new URLSearchParams(query).toString();
      navigate(`${path}${path.includes('?') ? '&' : '?'}${search}`, { replace: true });
    };

    const code = params.get('code');
    const state = params.get('state');
    const consentError = params.get('error');

    // The user pressed Cancel on Google's screen, or Google refused. A normal
    // outcome, not a fault — passed through unchanged so the card can stay
    // quiet about `access_denied`.
    if (consentError) {
      goBack(fallbackPath, { youtube: 'error', reason: consentError });
      return;
    }

    if (!code || !state) {
      goBack(fallbackPath, { youtube: 'error', reason: 'no_code' });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          connected?: boolean;
          channel_title?: string;
          return_path?: string;
        }>('youtube-oauth-callback', { body: { code, state } });

        if (error) {
          // The CODE, not the sentence: the settings card maps codes to copy,
          // and matching on a sentence would break the moment one is reworded.
          throw new Error(await codeFromInvokeError(error, 'exchange_failed'));
        }

        goBack(data?.return_path ?? fallbackPath, {
          youtube: 'connected',
          channel: data?.channel_title ?? '',
        });
      } catch (err) {
        setMessage('That did not work. Taking you back…');
        goBack(fallbackPath, {
          youtube: 'error',
          reason: err instanceof Error ? err.message : 'internal_error',
        });
      }
    })();
  }, [params, navigate]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-dc-teal-btn" aria-hidden />
      <p className="text-sm text-dc-text-muted">{message}</p>
    </div>
  );
}
