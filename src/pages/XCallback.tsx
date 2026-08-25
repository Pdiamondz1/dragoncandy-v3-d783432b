import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { codeFromInvokeError } from '@/lib/invokeError';
import { X_RETURN_PATH_KEY } from '@/hooks/useXConnection';

/**
 * Where X sends the browser after consent.
 *
 * This page exists for one reason: it is inside the app, so the user has a
 * session here. It hands the `code` to `x-oauth-callback` WITH that session's
 * JWT, which is what lets the backend prove the browser finishing consent is
 * the one that started it.
 *
 * X cannot redirect straight to the edge function without losing that proof — a
 * top-level navigation from x.com carries no Authorization header, and a signed
 * state alone does not close the gap: an attacker could start a flow and have a
 * victim's X tokens stored against their own account. The Facebook, Instagram,
 * YouTube and Workspace flows all work this way.
 *
 * NOTE FOR WHOEVER CONFIGURES THE X CONSOLE: the callback registered there must
 * be `https://dragoncandy.com/x/callback`, this page — not the edge function
 * URL. Registering the function directly is the design this replaces.
 *
 * Nothing renders for long. It exchanges, then replaces itself with wherever the
 * user was, carrying `?x=…` so the settings card can say what happened — the
 * card owns all the wording; this page only carries the code.
 */
export default function XCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Finishing your X connection…');

  // React 18 StrictMode mounts effects twice in development, and an
  // authorization code is single-use — a second exchange fails and would
  // overwrite a genuine success with `exchange_failed`.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The browser's own memory of where it was, stashed before it left. The
    // server's signed copy only comes back on success, and a failure needs
    // somewhere to go too — landing on `/` would drop the user on the public
    // landing page, which cannot tell them what went wrong.
    const stashed = sessionStorage.getItem(X_RETURN_PATH_KEY);
    sessionStorage.removeItem(X_RETURN_PATH_KEY);
    const fallbackPath = stashed && stashed.startsWith('/') ? stashed : '/';

    const goBack = (path: string, query: Record<string, string>) => {
      const search = new URLSearchParams(query).toString();
      navigate(`${path}${path.includes('?') ? '&' : '?'}${search}`, { replace: true });
    };

    const code = params.get('code');
    const state = params.get('state');
    // X follows the OAuth 2.0 spec here: `error` plus `error_description`.
    // `access_denied` is what a Cancel produces.
    const consentError = params.get('error');

    // The user pressed Cancel on X's screen, or X refused. A normal outcome, not
    // a fault — passed through unchanged so the card can stay quiet about a
    // denial rather than showing an alarming failure.
    if (consentError) {
      goBack(fallbackPath, { x: 'error', reason: consentError });
      return;
    }

    if (!code || !state) {
      goBack(fallbackPath, { x: 'error', reason: 'no_code' });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          connected?: boolean;
          username?: string | null;
          can_refresh?: boolean;
          return_path?: string;
        }>('x-oauth-callback', { body: { code, state } });

        if (error) {
          // The CODE, not the sentence: the settings card maps codes to copy,
          // and matching on a sentence breaks the moment one is reworded. This
          // is how `account_in_use` — the same X account already linked to
          // another DragonCandy user — reaches the card as its own explainable
          // case rather than a generic failure.
          throw new Error(await codeFromInvokeError(error, 'exchange_failed'));
        }

        goBack(data?.return_path ?? fallbackPath, {
          x: 'connected',
          username: data?.username ?? '',
          // Surfaced so the card can warn immediately when a user declined
          // offline access. That connection is real and dies in two hours, and
          // finding out later from a card that stopped updating is worse.
          can_refresh: data?.can_refresh === false ? 'false' : 'true',
        });
      } catch (err) {
        setMessage('That did not work. Taking you back…');
        goBack(fallbackPath, {
          x: 'error',
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
