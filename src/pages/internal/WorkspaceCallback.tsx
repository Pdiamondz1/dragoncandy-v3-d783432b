import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompleteGoogleConnection } from '@/hooks/internal/useGoogleWorkspace';
import { Spinner } from '@/components/ui/spinner';

/**
 * Google OAuth landing (/internal/workspace/callback). The code+state params
 * are captured ONCE at mount (deep-link param race lesson: never read live
 * URL params from an effect that races a cleanup), exchanged server-side,
 * then the URL is scrubbed.
 */
const WorkspaceCallback = () => {
  const navigate = useNavigate();
  const complete = useCompleteGoogleConnection();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const googleError = params.get('error');

    // Scrub the one-time code from the address bar/history immediately.
    window.history.replaceState({}, '', '/internal/workspace/callback');

    if (googleError) {
      setError(googleError === 'access_denied' ? 'Google connect was cancelled.' : googleError);
      return;
    }
    if (!code || !state) {
      setError('Missing authorization response — restart the connect flow.');
      return;
    }

    complete.mutate(
      { code, state },
      {
        onSuccess: () => navigate('/internal/workspace', { replace: true }),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Connection could not be completed.'),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-dc-teal/25 bg-white/[0.04] p-7 text-center backdrop-blur-md">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-white">Google connect failed</h1>
            <p className="mt-2 text-sm text-white/60">{error}</p>
            <Link
              to="/internal/workspace"
              className="mt-5 inline-block w-full rounded-full bg-dc-teal px-6 py-3 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark"
            >
              Back to Workspace
            </Link>
          </>
        ) : (
          <>
            <Spinner className="mx-auto h-10 w-10 border-teal-400" />
            <p className="mt-4 text-sm font-semibold text-white">Linking your Google account…</p>
            <p className="mt-1 text-xs text-white/50">Creating your DragonCandy AIOS folder.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkspaceCallback;
