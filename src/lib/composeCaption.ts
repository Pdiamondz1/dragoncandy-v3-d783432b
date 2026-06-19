/** Join a brief's caption with its hashtags for pre-filling the DragonShare caption field.
 *  Hashtags are appended on a blank line only when present; each is normalized to start with '#'.
 *  Pure — no React, no I/O. Safe against null/undefined and non-string hashtag entries. */
export function composeCaption(sampleCaption?: string | null, hashtags?: string[] | null): string {
  const caption = (sampleCaption ?? '').trim();
  const tags = (hashtags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  if (!caption && tags.length === 0) return '';
  if (tags.length === 0) return caption;
  if (!caption) return tags.join(' ');
  return `${caption}\n\n${tags.join(' ')}`;
}
