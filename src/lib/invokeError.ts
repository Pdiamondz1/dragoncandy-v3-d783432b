/**
 * Reading a failed `supabase.functions.invoke`.
 *
 * On a non-2xx, invoke puts the response body in `error.context` (a Response)
 * and leaves `data` null — so the natural-looking `data?.error` after a failure
 * silently reads `undefined`, and the user gets a generic message while the
 * server was telling them exactly what went wrong. Same handling as
 * `useRunPlaybook`.
 */

interface InvokeErrorBody {
  /** Machine-readable code, e.g. `missing_scope`. */
  error?: string;
  /** Human sentence. */
  message?: string;
}

/**
 * `clone()` matters: a Response body can be read exactly once, so a caller that
 * wants both the code and the message would find the second helper reading an
 * already-consumed stream and silently falling back to generic copy. Cloning
 * leaves the original untouched for whoever reads next.
 */
async function bodyOf(error: unknown): Promise<InvokeErrorBody | null> {
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.clone !== 'function') return null;
  try {
    return (await ctx.clone().json()) as InvokeErrorBody;
  } catch {
    // Not JSON, or the body was consumed without cloning somewhere else.
    return null;
  }
}

/** The sentence to show a user. */
export async function messageFromInvokeError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const body = await bodyOf(error);
  return (
    body?.message ?? body?.error ?? (error as { message?: string })?.message ?? fallback
  );
}

/**
 * The machine-readable code, for a caller that maps codes to its own copy.
 *
 * Distinct from `messageFromInvokeError` on purpose: a caller that owns the
 * wording needs the code, and would otherwise try to match on a sentence.
 */
export async function codeFromInvokeError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const body = await bodyOf(error);
  return body?.error ?? fallback;
}
