// Pure SHA-256 hex digest. Web Crypto works under both Deno (edge) and Node (vitest).
// No https:// imports so vitest can load it.
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
