import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { codeFromInvokeError } from '@/lib/invokeError';
import { TIKTOK_RETURN_PATH_KEY } from '@/hooks/useTikTokConnection';

/**
 * Where TikTok sends the browser after consent.
 *
 * This page exists for one reason: it is inside the app, so the user has a
 * session here. It hands the `code` to `tiktok-oauth-callback` WITH that
 * session's JWT, which is what lets the backend prove the browser finishing
 * consent is the one that started it.
 *
 * TikTok cannot redirect straight to the edge function without losing that
 * proof — a top-level navigation from tiktok.com carries no Authorization
 * header, and a signed state alone does not close the gap: an attacker could
 * start a flow and have a victim's TikTok tokens stored against their own
 * account. Every connector in this family works this way.
 *
 * NOTE FOR WHOEVER CONFIGURES THE TIKTOK CONSOLE: the redirect URI registered
 * there must be `https://dragoncandy.com/tiktok/callback`, this page — NOT the
 * edge function URL. The configuration recorded on 2026-08-23 planned the
 * function URL; that is the design this replaces. Nothing was ever persisted
 * with it, because TikTok's app-details form cannot be saved until an App Review
 * demo video exists, so this corrects a plan rather than a live setting.
 *
 * Nothing renders for long. It exchanges, then replaces itself with wherever the
 * user was, carrying `?tiktok=…` so the settings card can say what happened —
 * the card owns all the wording; this page only carries the code.
 */
export default function TikTokCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Finishing your TikTok connection…');

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
    const stashed = sessionStorage.getItem(TIKTOK_RETURN_PATH_KEY);
    sessionStorage.removeItem(TIKTOK_RETURN_PATH_KEY);
    const fallbackPath = stashed && stashed.startsWith('/') ? stashed : '/';

    const goBack = (path: string, query: Record<string, string>) => {
      const search = new URLSearchParams(query).toString();
      navigate(`${path}${path.includes('?') ? '&' : '?'}${search}`, { replace: true });
    };

    const code = params.get('code');
    const state = params.get('state');

    // TikTok follows the OAuth 2.0 spec here, and ALSO returns `errCode` on some
    // failures. Both are read, `error` first, so a denial is recognised whichever
    // shape it arrives in — checking only one would let the other fall through to
    // "no_code", which reads as a bug rather than as a cancellation.
    const consentError = params.get('error') ?? params.get('errCode');

    // The user pressed Cancel on TikTok's screen, or TikTok refused. A normal
    // outcome, not a fault — passed through unchanged so the card can stay quiet
    // about a denial rather than showing an alarming failure.
    if (consentError) {
      goBack(fallbackPath, { tiktok: 'error', reason: consentError });
      return;
    }

    if (!code || !state) {
      goBack(fallbackPath, { tiktok: 'error', reason: 'no_code' });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          connected?: boolean;
          username?: string | null;
          display_name?: string | null;
          return_path?: string;
        }>('tiktok-oauth-callback', { body: { code, state } });

        if (error) {
          // The CODE, not the sentence: the settings card maps codes to copy,
          // and matching on a sentence breaks the moment one is reworded.
          throw new Error(await codeFromInvokeError(error, 'exchange_failed'));
        }

        goBack(data?.return_path ?? fallbackPath, {
          tiktok: 'connected',
          // Prefer the handle, fall back to the display name. Empty string
          // rather than "undefined" so the card can test for presence.
          username: data?.username ?? data?.display_name ?? '',
        });
      } catch (err) {
        setMessage('That did not work. Taking you back…');
        goBack(fallbackPath, {
          tiktok: 'error',
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
