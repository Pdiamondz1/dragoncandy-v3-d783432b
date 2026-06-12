import { FileOutput } from 'lucide-react';
import { toast } from 'sonner';
import { useExportToDoc } from '@/hooks/internal/useGoogleWorkspace';

interface ExportToDocButtonProps {
  title: string;
  markdown: string;
  /** 'pill' for card headers, 'ghost' for inline (e.g. under a Donny answer). */
  variant?: 'pill' | 'ghost';
}

/** "Export to Doc" — sends markdown to the caller's DragonCandy Drive folder. */
export const ExportToDocButton = ({ title, markdown, variant = 'pill' }: ExportToDocButtonProps) => {
  const exportDoc = useExportToDoc();

  const run = () =>
    exportDoc.mutate(
      { title, markdown },
      {
        onSuccess: (file) =>
          toast.success(`Exported "${file.name}" to Google Docs`, {
            action: file.webViewLink
              ? { label: 'Open', onClick: () => window.open(file.webViewLink, '_blank', 'noopener') }
              : undefined,
          }),
        onError: (err) => {
          const message = err instanceof Error ? err.message : '';
          toast.error(
            message.includes('connect')
              ? 'Connect Google on the Workspace page first.'
              : 'Export failed — try again.'
          );
        },
      }
    );

  const styles =
    variant === 'pill'
      ? 'flex items-center gap-1.5 rounded-full border border-dc-teal/30 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]'
      : 'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-dc-teal';

  return (
    <button type="button" disabled={exportDoc.isPending} onClick={run} className={`${styles} disabled:opacity-50`}>
      <FileOutput className={variant === 'pill' ? 'h-4 w-4 text-dc-teal' : 'h-3.5 w-3.5'} />
      {exportDoc.isPending ? 'Exporting…' : 'Export to Doc'}
    </button>
  );
};
