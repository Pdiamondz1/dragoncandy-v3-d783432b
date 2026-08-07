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

/** Parse a free-text hashtag field back into the `text[]` shape the DB stores.
 *
 *  The inverse of the normalization above, and deliberately its neighbour: a
 *  round-trip that disagrees with itself is how an edit silently mangles the
 *  tags it was meant to preserve.
 *
 *  Stored values carry the leading '#' — verified against prod rows, which are
 *  uniformly `#DragonDashed`-style — so that is what this emits.
 *
 *  Splits on whitespace AND commas, since people type both. Leading '#'s are
 *  stripped before exactly one is re-added, so `##tag` and `tag` both land on
 *  `#tag`. Duplicates are dropped, first occurrence wins, order otherwise
 *  preserved.
 *
 *  NOTE: no `\w`/`[a-z]` filtering anywhere. Real stored tags include `#CaféLife`,
 *  and an ASCII-only character class would silently truncate it to `#Caf`.
 *  Pure — no React, no I/O. */
export function parseHashtagInput(input?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(input ?? '').split(/[\s,]+/)) {
    const bare = raw.trim().replace(/^#+/, '');
    if (!bare) continue;
    const tag = `#${bare}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
