export type WikiFolder = 'concepts' | 'analyses';

const FOLDERS: WikiFolder[] = ['concepts', 'analyses'];
const FILENAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Title → safe kebab filename stem (no extension). Always returns a usable slug. */
export function slugify(title: string): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'donny-answer';
}

/** Deterministic defaults for the save dialog, derived from the answer markdown. */
export function deriveWikiDefaults(markdown: string): { title: string; folder: WikiFolder; filename: string } {
  const text = (markdown ?? '').trim();
  const heading = text.match(/^#{1,6}\s+(.+?)\s*#*$/m);
  let title = heading ? heading[1].trim() : '';
  if (!title) {
    const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
    title = sentence.replace(/[#>*_`[\]]/g, '').replace(/[.!?]+$/, '').trim();
  }
  title = title.slice(0, 120).trim() || 'Donny answer';
  return { title, folder: 'analyses', filename: slugify(title) };
}

/** Mirror of the wiki-save-answer edge guard so the UI never submits an invalid save. */
export function validateSaveInput(input: { folder: string; filename: string; title: string }): { ok: boolean; error?: string } {
  if (!FOLDERS.includes(input.folder as WikiFolder)) return { ok: false, error: 'Pick a folder (concepts or analyses).' };
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  if (!FILENAME_RE.test(input.filename)) {
    return { ok: false, error: 'Filename: lowercase letters, numbers and hyphens, starting with a letter or number.' };
  }
  return { ok: true };
}

/** Turn a wiki-save edge error into user-facing copy. */
export function saveErrorMessage(error: string): string {
  if (error === 'github_not_configured') return 'Add GITHUB_WIKI_TOKEN to the edge function to enable wiki PRs.';
  if (error === 'file_exists') return 'A wiki page with that filename already exists — choose a different filename.';
  return error;
}
