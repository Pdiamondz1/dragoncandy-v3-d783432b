// Normalize an unknown thrown value into a client-safe { message, code? }.
//
// The catch-all in index.ts used to do `err instanceof Error ? err.message :
// "internal error"`, which collapsed any NON-Error throw to the opaque string
// "internal error". Supabase PostgrestErrors (e.g. a foreign-key violation) are
// plain objects, so a real DB failure surfaced — to both the user and the logs —
// as a meaningless "internal error". This pulls a real message/code out of those
// objects so failures are diagnosable. Pure (no Deno/global deps) so it is unit
// tested under vitest.
export function describeError(err: unknown): { message: string; code?: string } {
  if (err instanceof Error) return { message: err.message };

  if (typeof err === 'string' && err.trim()) return { message: err };

  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const message =
      typeof e.message === 'string' && e.message.trim() ? e.message : 'internal error';
    const code = typeof e.code === 'string' && e.code.trim() ? e.code : undefined;
    return code ? { message, code } : { message };
  }

  return { message: 'internal error' };
}
