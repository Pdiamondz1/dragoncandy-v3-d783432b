// Mirror of the SQL staleness comparison (btrim of content_md) used by
// aios_corrections_apply, so the /internal/corrections UI can flag a proposal as
// stale before the apply RPC re-checks server-side. Keep the two in sync.
export function normalizeForCompare(s: string | null | undefined): string {
  return (s ?? '').trim();
}
