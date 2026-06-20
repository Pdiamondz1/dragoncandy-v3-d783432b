// supabase/functions/_shared/drive-export.ts
// Pure mime→read-strategy mapping + output cap for reading AIOS-folder files.
// Dependency-free (no Deno globals, no https imports) so Vitest runs it in CI.

export const EXPORT_CAP = 50_000; // chars — protects Donny's context window

export type ExportMode =
  | { mode: 'export'; exportMime: string }
  | { mode: 'media' }
  | { mode: 'unsupported' };

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';

/** Decide how to pull a file's text given its Drive mimeType. Slides + binary
 *  are unsupported (Docs + Sheets cover the founder's need; see spec §8). */
export function pickExportMode(mimeType: string): ExportMode {
  if (mimeType === GOOGLE_DOC) return { mode: 'export', exportMime: 'text/markdown' };
  if (mimeType === GOOGLE_SHEET) return { mode: 'export', exportMime: 'text/csv' };
  if (mimeType === 'text/markdown' || mimeType === 'text/plain') return { mode: 'media' };
  return { mode: 'unsupported' };
}

export function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= EXPORT_CAP) return { text, truncated: false };
  return { text: text.slice(0, EXPORT_CAP), truncated: true };
}
