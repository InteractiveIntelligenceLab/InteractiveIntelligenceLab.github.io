// fetch() wrapper with timeout + exponential backoff, used by every external
// data source (OpenAlex, DBLP, Google News RSS, Google APIs). Centralizing
// this is what lets each sync script honor "never erase good data because a
// remote service hiccuped" — callers decide what to do on failure, this just
// makes failure vs. success unambiguous.
export interface FetchRetryOptions {
  retries?: number;
  timeoutMs?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
  method?: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const { retries = 3, timeoutMs = 15_000, backoffMs = 1000, headers = {}, method = "GET" } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastError = new HttpError(res.status, `HTTP ${res.status} from ${url}`);
        if (attempt < retries) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
          const delay = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : backoffMs * 2 ** attempt;
          await sleep(delay);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        throw new HttpError(res.status, `HTTP ${res.status} from ${url}`);
      }

      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
