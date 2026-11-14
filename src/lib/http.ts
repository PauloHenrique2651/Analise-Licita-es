import "server-only";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: string,
  ) {
    super(message);
  }
}

type FetchOptions = {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  cacheSeconds?: number;
  headers?: HeadersInit;
};

export async function fetchJson<T>(url: URL, options: FetchOptions): Promise<T> {
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "NexoPublico/0.1 (contato: paulohenrique.cardoso2651@gmail.com)",
          ...options.headers,
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
        redirect: "error",
        next: { revalidate: options.cacheSeconds ?? 900 },
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < retries) {
          const retryAfter = response.headers.get("retry-after");
          const numericSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
          const retryDate = retryAfter && !Number.isFinite(numericSeconds) ? Date.parse(retryAfter) : Number.NaN;
          const retryAfterMs = Number.isFinite(numericSeconds)
            ? numericSeconds * 1_000
            : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0;
          const backoffMs = Math.min(60_000, Math.max(retryAfterMs, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 250));
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new ProviderError(
          `${options.provider} respondeu com HTTP ${response.status}.`,
          response.status,
          options.provider,
        );
      }
      const body = await response.text();
      return (body.trim() ? JSON.parse(body) : null) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries && !(error instanceof ProviderError)) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt + Math.floor(Math.random() * 250)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
