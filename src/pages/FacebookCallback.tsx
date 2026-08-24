import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { codeFromInvokeError } from '@/lib/invokeError';
import { FACEBOOK_RETURN_PATH_KEY } from '@/hooks/useFacebookConnection';

/**
 * Where Facebook sends the browser after consent.
 *
 * This page exists for one reason: it is inside the app, so the user has a
 * session here. It hands the `code` to `facebook-oauth-callback` WITH that
 * session's JWT, which is what lets the backend prove the browser finishing
 * consent is the one that started it.
 *
 * Facebook cannot redirect straight to the edge function without losing that
 * proof — a top-level navigation from facebook.com carries no Authorization
 * header, and a signed state alone does not close the gap: an attacker could
 * start a flow and have a victim's Page tokens stored against their own account.
 * The Instagram, YouTube and Workspace flows all work this way.
 *
 * Nothing renders for long. It exchanges, then replaces itself with wherever the
 * user was, carrying `?facebook=…` so the settings card can say what happened —
 * the card owns all the wording; this page only carries the code.
 */
export default function FacebookCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Finishing your Facebook connection…');

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
    const stashed = sessionStorage.getItem(FACEBOOK_RETURN_PATH_KEY);
    sessionStorage.removeItem(FACEBOOK_RETURN_PATH_KEY);
    const fallbackPath = stashed && stashed.startsWith('/') ? stashed : '/';

    const goBack = (path: string, query: Record<string, string>) => {
      const search = new URLSearchParams(query).toString();
      navigate(`${path}${path.includes('?') ? '&' : '?'}${search}`, { replace: true });
    };

    const code = params.get('code');
    const state = params.get('state');
    // Meta uses `error` with `error_reason`/`error_description`; `error_reason`
    // is the machine-readable one (`user_denied`), so prefer it when both exist.
    const consentError = params.get('error_reason') || params.get('error');

    // The user pressed Cancel on Facebook's screen, or Meta refused. A normal
    // outcome, not a fault — passed through unchanged so the card can stay quiet
    // about a denial.
    if (consentError) {
      goBack(fallbackPath, { facebook: 'error', reason: consentError });
      return;
    }

    if (!code || !state) {
      goBack(fallbackPath, { facebook: 'error', reason: 'no_code' });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          connected?: Array<{ page_name?: string | null }>;
          return_path?: string;
        }>('facebook-oauth-callback', { body: { code, state } });

        if (error) {
          // The CODE, not the sentence: the settings card maps codes to copy,
          // and matching on a sentence breaks the moment one is reworded. This
          // is how `no_pages` — a personal profile with no Page — reaches the
          // card as its own explainable case rather than a generic failure.
          throw new Error(await codeFromInvokeError(error, 'exchange_failed'));
        }

        const pages = data?.connected ?? [];
        goBack(data?.return_path ?? fallbackPath, {
          facebook: 'connected',
          // The COUNT, because one consent can return several Pages and "Connected
          // Joe's Pizza" would be a lie when three Pages were linked.
          count: String(pages.length),
          page: pages.length === 1 ? (pages[0]?.page_name ?? '') : '',
        });
      } catch (err) {
        setMessage('That did not work. Taking you back…');
        goBack(fallbackPath, {
          facebook: 'error',
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
