import { CloudUpload, FileSpreadsheet, FileText, MessageSquareText, Unplug } from 'lucide-react';
import {
  useGoogleConnection,
  useConnectGoogle,
  useDisconnectGoogle,
} from '@/hooks/internal/useGoogleWorkspace';
import { ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

/**
 * AIOS Workspace (GW PR 1: connection states only — the Drive file hub lands
 * in GW PR 2). Per-user Google OAuth; tokens never reach this client.
 */
const InternalWorkspace = () => {
  const connection = useGoogleConnection();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();

  if (connection.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (connection.isError || !connection.data) {
    return <ErrorCard message="Could not load your Google connection state." />;
  }

  const status = connection.data;

  if (!status.connected) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-xl font-bold text-dc-text lg:text-2xl">WORKSPACE</h1>
        <p className="mt-1 text-sm text-dc-text-muted">
          Connect Google to flow docs, sheets, slides, briefs, and metrics between AIOS and Drive.
        </p>

        <div className="mt-6 rounded-3xl border-2 border-teal-400 bg-dc-card p-7">
          {status.needs_reconnect && (
            <p className="mb-4 rounded-2xl border border-dc-pink-accent/40 bg-dc-pink/20 px-4 py-2.5 text-xs text-dc-text">
              Your Google connection expired or was revoked — re-link to continue.
            </p>
          )}

          <ul className="space-y-3 text-sm text-dc-text-muted">
            <li className="flex items-start gap-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-dc-teal" />
              <span>
                A private <span className="font-semibold text-dc-text">DragonCandy AIOS</span> folder
                in your Drive — docs, sheets, and slides, editable in Google, previewable here.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-dc-teal" />
              Upload from your device, download back — files round-trip through Drive.
            </li>
            <li className="flex items-start gap-2.5">
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-dc-teal" />
              Weekly briefs and metrics export to Docs and Sheets automatically.
            </li>
            <li className="flex items-start gap-2.5">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-dc-teal" />
              Donny answers in Google Chat once the DragonCandy Workspace exists.
            </li>
          </ul>

          <button
            type="button"
            disabled={connect.isPending}
            onClick={() => connect.mutate()}
            className="mt-6 w-full rounded-full bg-dc-teal px-6 py-3 font-bold text-white transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
          >
            {connect.isPending ? 'Opening Google…' : 'Connect Google'}
          </button>
          {connect.isError && (
            <p className="mt-3 text-center text-xs text-dc-pink-accent">
              {connect.error instanceof Error ? connect.error.message : 'Could not start the connect flow.'}
            </p>
          )}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-dc-text-muted">
            The app only sees files it creates — never your whole Drive. Google may show an
            "unverified app" notice; that's expected for our internal tool.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dc-text lg:text-2xl">WORKSPACE</h1>
          <p className="mt-1 text-sm text-dc-text-muted">
            Connected as <span className="font-semibold text-dc-text">{status.google_email}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate()}
          className="flex items-center gap-1.5 rounded-full border border-dc-teal px-4 py-1.5 text-sm font-semibold text-dc-pink-accent transition-colors hover:bg-dc-teal/12 disabled:opacity-50"
        >
          <Unplug className="h-3.5 w-3.5" />
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>

      <div className="mt-6 rounded-3xl border-2 border-teal-400 bg-dc-card p-7 text-center">
        <p className="text-sm font-semibold text-dc-text">Your DragonCandy AIOS folder is ready.</p>
        <p className="mt-1 text-sm text-dc-text-muted">
          The file hub — browse, upload, create, preview — arrives in the next slice (GW PR 2).
        </p>
      </div>
    </div>
  );
};

export default InternalWorkspace;
