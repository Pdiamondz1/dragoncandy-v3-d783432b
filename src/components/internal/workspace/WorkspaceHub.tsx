import { useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileSpreadsheet, FileText, Presentation, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ErrorCard } from '@/components/internal/stats';
import {
  useCreateWorkspaceFile,
  useRenameWorkspaceFile,
  useTrashWorkspaceFile,
  useUploadWorkspaceFiles,
  useWorkspaceFiles,
  type WorkspaceFile,
  type WorkspaceFileKind,
} from '@/hooks/internal/useGoogleWorkspace';
import { NameDialog } from './NameDialog';
import { WorkspaceFileGrid } from './WorkspaceFileGrid';
import { WorkspacePreviewPane } from './WorkspacePreviewPane';

interface CreateKind {
  kind: WorkspaceFileKind;
  label: string;
  icon: typeof FileText;
}

const CREATE_KINDS: CreateKind[] = [
  { kind: 'doc', label: 'New Doc', icon: FileText },
  { kind: 'sheet', label: 'New Sheet', icon: FileSpreadsheet },
  { kind: 'slides', label: 'New Slides', icon: Presentation },
];

/** The Drive file hub: toolbar, dropzone, file grid, embedded preview. */
export const WorkspaceHub = () => {
  const files = useWorkspaceFiles();
  const create = useCreateWorkspaceFile();
  const rename = useRenameWorkspaceFile();
  const trash = useTrashWorkspaceFile();
  const upload = useUploadWorkspaceFiles();

  const [createEntry, setCreateEntry] = useState<CreateKind | null>(null);
  const [renaming, setRenaming] = useState<WorkspaceFile | null>(null);
  const [trashing, setTrashing] = useState<WorkspaceFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fileList = files.data ?? [];
  const selected = fileList.find((f) => f.id === selectedId) ?? null;

  const actions = useMemo(
    () => ({
      onSelect: (file: WorkspaceFile) => setSelectedId(file.id),
      onRename: setRenaming,
      onTrash: setTrashing,
    }),
    []
  );

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (accepted) => {
      if (!accepted.length) return;
      upload.mutate(accepted, {
        onSuccess: (failedNames) =>
          failedNames.forEach((name) => toast.error(`Could not upload ${name}`)),
      });
    },
  });

  if (files.isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }
  if (files.isError) return <ErrorCard message="Could not load your Drive files." />;

  return (
    <div
      {...getRootProps()}
      className={`mt-6 rounded-3xl transition-shadow ${isDragActive ? 'ring-2 ring-dc-teal ring-offset-2' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-wrap items-center gap-2">
        {CREATE_KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            onClick={() => setCreateEntry(entry)}
            className="flex items-center gap-1.5 rounded-full border border-dc-teal/30 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]"
          >
            <entry.icon className="h-4 w-4 text-dc-teal" /> {entry.label}
          </button>
        ))}
        <button
          type="button"
          disabled={upload.isPending}
          onClick={open}
          className="flex items-center gap-1.5 rounded-full bg-dc-teal px-4 py-1.5 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className={`mt-4 gap-4 ${selected ? 'lg:grid lg:grid-cols-[1fr,minmax(360px,440px)]' : ''}`}>
        {selected && (
          <div className="mb-4 lg:order-2 lg:mb-0">
            <WorkspacePreviewPane file={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
        <div className="lg:order-1">
          <WorkspaceFileGrid files={fileList} selectedId={selectedId} actions={actions} />
        </div>
      </div>

      <NameDialog
        open={createEntry !== null}
        title={createEntry?.label ?? ''}
        cta="Create"
        pending={create.isPending}
        onOpenChange={(isOpen) => !isOpen && setCreateEntry(null)}
        onSubmit={(name) => {
          if (!createEntry) return;
          create.mutate(
            { kind: createEntry.kind, name },
            {
              onSuccess: (file) => {
                setCreateEntry(null);
                setSelectedId(file.id);
              },
              onError: () => toast.error('Could not create the file.'),
            }
          );
        }}
      />

      <NameDialog
        open={renaming !== null}
        title="Rename"
        cta="Rename"
        initialName={renaming?.name}
        pending={rename.isPending}
        onOpenChange={(isOpen) => !isOpen && setRenaming(null)}
        onSubmit={(name) => {
          if (!renaming) return;
          rename.mutate(
            { fileId: renaming.id, name },
            {
              onSuccess: () => setRenaming(null),
              onError: () => toast.error('Could not rename the file.'),
            }
          );
        }}
      />

      <AlertDialog open={trashing !== null} onOpenChange={(isOpen) => !isOpen && setTrashing(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Move "{trashing?.name}" to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              You can restore it from the trash in Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={trash.isPending}
              className="rounded-full bg-dc-pink-accent-btn hover:bg-dc-pink-accent-btn-hover"
              onClick={() => {
                if (!trashing) return;
                trash.mutate(trashing.id, {
                  onSuccess: () => setTrashing(null),
                  onError: () => toast.error('Could not trash the file.'),
                });
              }}
            >
              {trash.isPending ? 'Trashing…' : 'Move to trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
