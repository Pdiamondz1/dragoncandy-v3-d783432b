import { useEffect } from 'react';

// Mirrors supabase/functions/outstand-proxy/index.ts:sanitizeFilename so the
// File object the SDK uploads matches what the proxy would have rewritten on
// /media/upload anyway. Doing it here too means the upload PUT body, the S3
// key, the Outstand-stored row, and the public URL Outstand returns from the
// confirm endpoint are all the same sanitized string — so Facebook/Instagram
// fetches succeed without URL-encoding tricks.
export function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf('.');
  let base = name;
  let ext = '';
  if (lastDot > 0 && lastDot < name.length - 1) {
    base = name.slice(0, lastDot);
    ext = name.slice(lastDot);
  }
  base = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  ext = ext.replace(/[^a-zA-Z0-9.]/g, '');
  if (!base) base = 'file';
  return `${base}${ext}`;
}

// Rewrites every <input type="file"> change in capture phase: any picked
// File whose name has unsafe characters is replaced with a fresh File that
// carries the sanitized name. The replacement happens synchronously before
// React's bubble-phase delegation reads `event.target.files`, so any SDK
// component that consumes the input (e.g. Outstand's MediaUploader) sees the
// already-sanitized File from the start.
export function useSanitizeFileInputs(): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'file') return;
      const files = target.files;
      if (!files || files.length === 0) return;

      let dirty = false;
      const renamed: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const cleanName = sanitizeFilename(file.name);
        if (cleanName === file.name) {
          renamed.push(file);
          continue;
        }
        dirty = true;
        renamed.push(
          new File([file], cleanName, {
            type: file.type,
            lastModified: file.lastModified,
          }),
        );
      }
      if (!dirty) return;

      try {
        const dt = new DataTransfer();
        for (const f of renamed) dt.items.add(f);
        target.files = dt.files;
      } catch (err) {
        console.warn('useSanitizeFileInputs: could not replace FileList', err);
      }
    };

    document.addEventListener('change', handler, true);
    return () => document.removeEventListener('change', handler, true);
  }, []);
}
