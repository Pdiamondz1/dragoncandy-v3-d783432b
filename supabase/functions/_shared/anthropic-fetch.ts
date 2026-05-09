const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function anthropicFetch(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, init);
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
      return response;
    }

    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000)
      : BASE_DELAY_MS * Math.pow(2, attempt);

    console.warn(
      `[anthropic-fetch] ${response.status} on attempt ${attempt + 1}/${retries + 1}, retrying in ${delay}ms`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error("Unreachable");
}
