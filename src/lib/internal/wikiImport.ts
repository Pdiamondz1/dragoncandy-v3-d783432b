export type WikiFolder = 'concepts' | 'analyses';

export function kebab(s: string): string {
  return s.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function deriveImportDefaults(fileName: string): { title: string; folder: WikiFolder; filename: string } {
  return { title: fileName.trim(), folder: 'analyses', filename: kebab(fileName) };
}

export function validateImportInput(input: { folder: string; filename: string; title: string }): { ok: boolean; error?: string } {
  if (!['concepts', 'analyses'].includes(input.folder)) return { ok: false, error: 'Pick a folder.' };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.filename)) return { ok: false, error: 'Filename must be kebab-case.' };
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  return { ok: true };
}

export function isImportable(mimeType: string): boolean {
  return (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain'
  );
}
