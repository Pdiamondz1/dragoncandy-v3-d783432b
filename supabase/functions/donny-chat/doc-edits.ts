// Pure, testable find/replace edit application for strategy-doc corrections.
//
// Donny emits small {old_string, new_string} blocks instead of the full corrected
// document; the propose_correction handler applies them server-side against the current
// internal_docs.content_md to reconstruct the full proposed_value. Shrinking Donny's
// OUTPUT (kilobytes -> a few changed lines) is what cuts the correction turn from ~130s
// to seconds. Semantics mirror the Edit tool: exact substring match, no normalization,
// unique-by-default, replace_all opt-in. Kept as a pure module (no Deno/Supabase deps) so
// it can be unit-tested under vitest, like history.ts and stream-accumulator.ts.

export interface DocEdit {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export type ApplyResult = { content: string } | { error: string };

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

/**
 * Apply find/replace edits sequentially against `content`. Returns the new content, or an
 * error string naming the 1-based edit that failed. The batch is atomic from the caller's
 * perspective: on any failure nothing is returned, so the caller keeps the original doc.
 */
export function applyEdits(content: string, edits: DocEdit[]): ApplyResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { error: "no edits provided" };
  }

  let buffer = content;
  for (let i = 0; i < edits.length; i++) {
    const n = i + 1;
    const edit = edits[i];
    const oldStr = typeof edit?.old_string === "string" ? edit.old_string : "";
    const newStr = typeof edit?.new_string === "string" ? edit.new_string : "";

    if (oldStr === "") {
      return { error: `edit #${n}: old_string is empty` };
    }
    if (oldStr === newStr) {
      return { error: `edit #${n}: old_string and new_string are identical (no-op)` };
    }

    const matches = countOccurrences(buffer, oldStr);
    if (matches === 0) {
      return { error: `edit #${n}: old_string not found` };
    }

    if (edit.replace_all) {
      buffer = buffer.split(oldStr).join(newStr);
    } else if (matches > 1) {
      return {
        error: `edit #${n}: old_string not unique (${matches} matches) — add surrounding context or set replace_all`,
      };
    } else {
      const idx = buffer.indexOf(oldStr);
      buffer = buffer.slice(0, idx) + newStr + buffer.slice(idx + oldStr.length);
    }
  }

  return { content: buffer };
}
